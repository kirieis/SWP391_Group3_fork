import java.util.ArrayList;
import java.util.List;

public class GradeBook {
    private final List<String> names = new ArrayList<>();
    private final List<Double> scores = new ArrayList<>();

    public void addStudent(String name, double score) {
        if (score < 0 || score > 10) {
            throw new IllegalArgumentException("Score must be in [0, 10]");
        }
        names.add(name);
        scores.add(score);
    }

    public double average() {
        if (scores.isEmpty()) return 0;
        double sum = 0;
        for (double s : scores) sum += s;
        return sum / scores.size();
    }

    public static void main(String[] args) {
        GradeBook book = new GradeBook();
        book.addStudent("An", 8.5);
        book.addStudent("Binh", 4.0);
        book.addStudent("Chi", 9.0);
        System.out.println("Average: " + book.average());
    }
}
