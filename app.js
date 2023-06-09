const minimist = require('minimist')
const ProgressBar = require('progress')

const fetchContributions = require('./contributions')

const {
  numberWeeks,
  fillSpace
} = require('./constants')

const { getFirstSundayOfYear, formatDate, firstSundayDaysAgo } = require('./dateUtils')
const canvas = require('./canvas')
const { isCommitBeforeDate, createEmptyCommits } = require('./gitCommands')

const parseArgs = () => {
  const args = minimist(process.argv.slice(2), {
    default: {
      text: '',
      'image-path': '',
      'min-commits': 1,
      'max-commits': 30,
      'space-between-letters': 1,
      'dry-run': false
    },
    boolean: ['dry-run', 'help'],
    alias: {
      t: 'text',
      i: 'image-path',
      mc: 'min-commits',
      xc: 'max-commits',
      y: 'year',
      s: 'space-between-letters',
      u: 'user',
      h: 'help'
    }
  })

  const text = args.text
  const imagePath = args['image-path']
  const noInputProvided = !text && !imagePath
  if (args.help || noInputProvided) {
    console.log(`
  Usage: node app.js [options, text or image-path is required]
  
  Options:
    --help, -h                   Show this help message and exit
    --text, -t <string>          The text that should be render (text or image-path is required)
    --image-path, -i <string>    Path to an image 7 pixel height 53 width (text or image-path
                                 is required)
    --min-commits, --mc <number> Minimum number of commits (default: 1)
    --max-commits, --xc <number> Maximum number of commits (default: 30)
    --year, -y <number>          Year (default: current year)
    --space-between-letters, -s  <number> Space between letters (default: 1, valid: 0-7)
  --user, -u <string>          GitHub username to check for existing contributions (in beta)
    --dry-run                    Test mode (default: false)`
    )
    process.exit(args.help ? 0 : 1)
  }

  const year = args.year
  const initialDate = year ? getFirstSundayOfYear(year) : firstSundayDaysAgo(365)
  const endDate = year ? new Date(year, 11, 31, 12, 0, 0) : new Date()
  const minCommits = args['min-commits']
  const maxCommits = args['max-commits']
  const spaceBetweenLetters = args['space-between-letters']
  const user = args.user
  const test = args['dry-run']

  return {
    text,
    imagePath,
    minCommits,
    maxCommits,
    spaceBetweenLetters,
    test,
    initialDate,
    endDate,
    user
  }
}

const {
  text,
  imagePath,
  minCommits,
  maxCommits,
  initialDate,
  endDate,
  user,
  spaceBetweenLetters,
  test
} = parseArgs()

const main = async () => {
  const canvasMatrix = text
    ? canvas.processTextToCanvas(text, spaceBetweenLetters)
    : await canvas.processImageToCanvas(imagePath)

  canvas.printCanvas(canvasMatrix)

  if (test) {
    console.log('You are only previewing wyr --dry-run')
    process.exit(1)
  }

  const flatCanvas = canvas.flatByColumns(canvasMatrix)

  const progressBar = new ProgressBar('[:bar] :percent :etas', {
    total: flatCanvas.length,
    width: numberWeeks,
    complete: '=',
    incomplete: ' '
  })

  if (await isCommitBeforeDate(initialDate)) {
    throw new Error(`I am sorry, you need to remove the commits after ${formatDate(initialDate)} you can use the sh tool in this repo`)
  }

  let existingContributions = {}

  if (user) {
    console.warn('Parameter "user" is set. Note that commits made in other repositories will be accounted for in their contribution graph to calculate the number of commit that has to be created. This is in BETA since I am not sure how to account for the default timezone in github')
    const initialYear = initialDate.getFullYear()
    const finalYear = endDate.getFullYear()
    existingContributions = await fetchContributions(user, initialYear)
    if (initialYear !== finalYear) {
      const moreContributions = await fetchContributions(user, finalYear)
      existingContributions = { ...existingContributions, ...moreContributions }
    }
  }

  const iterationDate = new Date(initialDate.getTime())
  for (let i = 0; i < flatCanvas.length; i++) {
    if (iterationDate <= endDate) {
      const numCommitsNeeded = flatCanvas[i] === fillSpace ? maxCommits : minCommits
      const existingContributionsCount = existingContributions[formatDate(iterationDate)] || 0
      const numCommits = numCommitsNeeded - existingContributionsCount
      if (numCommits > 0) {
        await createEmptyCommits(iterationDate, numCommits)
      }
    }
    progressBar.tick()
    iterationDate.setDate(iterationDate.getDate() + 1)
  }
  progressBar.terminate()

  console.log(`
  Now you can push this to GitHub. Assuming you project is empty you can do:
  git branch -M main
  git remote add origin git@github.com:<user_name>/<project_name>.git
  git push -u origin main
  
  HAVE FUN! BE KIND!`
  )
}

main()
  .catch(error => console.error(error))
  .finally(process.exit)
